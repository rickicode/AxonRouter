#!/bin/bash
# =====================================================
# AxonRouter - Docker Deployment Script
# Multi-instance with Caddy + Optional Cloudflare Tunnel
# =====================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="axonrouter"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env.docker"
DEFAULT_REPLICAS=4

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_banner() {
	echo ""
	echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
	echo -e "${BLUE}║${NC}       ${GREEN}AxonRouter - Docker Deploy${NC}                ${BLUE}║${NC}"
	echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
	echo ""
}

check_prerequisites() {
	log_info "Checking prerequisites..."

	# Check Docker
	if ! command -v docker &>/dev/null; then
		log_error "Docker is not installed. Install from: https://docs.docker.com/get-docker/"
		exit 1
	fi

	# Check Docker Compose
	if ! docker compose version &>/dev/null; then
		log_error "Docker Compose is not installed."
		exit 1
	fi

	# Check Docker daemon
	if ! docker info &>/dev/null; then
		log_error "Docker daemon is not running."
		exit 1
	fi

	log_success "Prerequisites OK"
}

init_env() {
	log_info "Initializing environment file..."

	if [ ! -f "$ENV_FILE" ]; then
		cat >"$ENV_FILE" <<'EOF'
# AxonRouter - Docker Environment Variables
# ============================================

# Scaling
REPLICAS=4
DATA_PATH=./data

# Security - CHANGE THESE IN PRODUCTION!
JWT_SECRET=axonrouter-default-secret-change-me-in-production

# First-run dashboard password is 12345677. Change it in Settings -> Security after login.
# Application
NODE_ENV=production
PORT=12711
LOG_LEVEL=info

# Cloudflare Tunnel (optional)
# Get your tunnel token from: https://one.dash.cloudflare.com
# 1. Create a Cloudflare Zero Trust account
# 2. Networks → Tunnels → Create a tunnel
# 3. Select "Cloudflared" as the connector
# 4. Copy the token below
TUNNEL_TOKEN=
DOMAIN=axonrouter.yourdomain.com
EOF
		log_success "Created $ENV_FILE"
		log_warn "Please edit $ENV_FILE and set secure passwords!"
	else
		log_info "Environment file already exists"
	fi
}

build_image() {
	log_info "Building AxonRouter Docker image..."

	cd "$PROJECT_ROOT"
	docker build -t axonrouter:latest .

	log_success "Image built successfully"
}

get_env_value() {
	local key="$1"
	if [ ! -f "$ENV_FILE" ]; then
		return 1
	fi
	grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2-
}

set_env_value() {
	local key="$1"
	local value="$2"
	if grep -qE "^${key}=" "$ENV_FILE"; then
		sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
	else
		printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
	fi
}

ensure_cloudflare_token() {
	local token
	token="$(get_env_value TUNNEL_TOKEN)"
	if [ -n "$token" ]; then
		return 0
	fi

	echo ""
	echo -e "${BLUE}Cloudflare Tunnel token required${NC}"
	echo "Get it from: https://one.dash.cloudflare.com → Networks → Tunnels"
	read -r -p "Paste TUNNEL_TOKEN: " token

	if [ -z "$token" ]; then
		log_error "Cloudflare Tunnel selected but TUNNEL_TOKEN is empty"
		exit 1
	fi

	set_env_value "TUNNEL_TOKEN" "$token"
	log_success "Saved TUNNEL_TOKEN to $ENV_FILE"
}

ask_cloudflare_profile() {
	local answer
	echo ""
	read -r -p "Enable Cloudflare Tunnel? [y/N] " answer
	if [[ "$answer" =~ ^[Yy]$ ]]; then
		ensure_cloudflare_token
		echo "tunnel"
	fi
}

start_services() {
	local profile="${1:-}"
	local replicas="${2:-$DEFAULT_REPLICAS}"

	log_info "Starting AxonRouter with $replicas instances..."

	cd "$SCRIPT_DIR"

	# Export replicas for docker compose
	export REPLICAS="$replicas"

	if [ -n "$profile" ]; then
		docker compose -f "$COMPOSE_FILE" \
			--env-file "$ENV_FILE" \
			--profile "$profile" \
			up -d
	else
		docker compose -f "$COMPOSE_FILE" \
			--env-file "$ENV_FILE" \
			up -d
	fi

	log_success "Services started"
}

stop_services() {
	log_info "Stopping services..."

	cd "$SCRIPT_DIR"
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

	log_success "Services stopped"
}

restart_services() {
	local replicas="${1:-$DEFAULT_REPLICAS}"

	stop_services
	sleep 2
	start_services "" "$replicas"
}

scale_instances() {
	local replicas="$1"

	if [ -z "$replicas" ]; then
		log_error "Usage: $0 scale <number>"
		exit 1
	fi

	log_info "Scaling to $replicas instances..."

	cd "$SCRIPT_DIR"
	export REPLICAS="$replicas"
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --scale app="$replicas"

	log_success "Scaled to $replicas instances"
}

show_status() {
	cd "$SCRIPT_DIR"
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

show_logs() {
	local service="${1:-app}"
	local lines="${2:-100}"

	cd "$SCRIPT_DIR"
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail="$lines" -f "$service"
}

show_health() {
	log_info "Checking health..."

	echo ""
	echo -e "${BLUE}=== Caddy / Load Balancer${NC}"
	if curl -fsS http://localhost/health >/dev/null 2>&1; then
		log_success "Caddy: Healthy"
	else
		log_error "Caddy: Unhealthy"
	fi

	echo ""
	echo -e "${BLUE}=== App Services${NC}"
	cd "$SCRIPT_DIR"
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

	echo ""
	echo -e "${BLUE}=== App Health Inside Compose Network${NC}"
	if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app wget -q --spider http://localhost:12711/api/health 2>/dev/null; then
		log_success "App: Healthy"
	else
		log_warn "App: Health check not reachable yet or no running app container"
	fi
}

update_image() {
	log_info "Updating AxonRouter..."

	build_image
	restart_services
}

setup_cloudflare_tunnel() {
	echo ""
	echo -e "${BLUE}=== Cloudflare Tunnel Setup ===${NC}"
	echo ""
	echo "1. Go to https://one.dash.cloudflare.com"
	echo "2. Create a Cloudflare Zero Trust account (free)"
	echo "3. Go to Networks → Tunnels"
	echo "4. Click 'Create a tunnel'"
	echo "5. Select 'Cloudflared' as the connector"
	echo "6. Give it a name (e.g., 'axonrouter-home')"
	echo "7. Copy the tunnel token"
	echo ""
	read -p "Paste the tunnel token here: " token

	if [ -n "$token" ]; then
		# Update env file
		sed -i "s/^TUNNEL_TOKEN=.*/TUNNEL_TOKEN=$token/" "$ENV_FILE"
		log_success "Tunnel token saved to $ENV_FILE"
		echo ""
		echo "Optional: Set a custom subdomain"
		read -p "Domain (e.g., axonrouter.yourdomain.com) or press Enter to skip: " domain
		if [ -n "$domain" ]; then
			sed -i "s/^DOMAIN=.*/DOMAIN=$domain/" "$ENV_FILE"
			log_success "Domain saved: $domain"
			echo ""
			echo "Add this DNS record in Cloudflare:"
			echo -e "${YELLOW}Type: CNAME${NC}"
			echo -e "${YELLOW}Name: $(echo $domain | cut -d. -f1)${NC}"
			echo -e "${YELLOW}Target: <your-tunnel-id>.trycloudflare.com${NC}"
			echo -e "${YELLOW}Proxy: ON (orange cloud)${NC}"
		fi
		echo ""
		log_warn "Restart services to apply tunnel: ./deploy.sh restart"
	else
		log_error "No token provided"
	fi
}

show_help() {
	show_banner
	cat <<'EOF'
Usage: ./deploy.sh <command> [options]

Commands:
    install         Install and build from scratch
    start           Start all services
    stop            Stop all services
    restart         Restart all services
    scale <N>       Scale to N instances (e.g., ./deploy.sh scale 8)
    status          Show service status
    logs [service]  Show logs (default: app)
    health          Check health status
    update          Rebuild and restart
    tunnel-setup    Setup Cloudflare Tunnel
    cleanup         Stop and remove all containers/volumes
    help            Show this help

Examples:
    ./deploy.sh install              # First time setup
    ./deploy.sh scale 8             # Scale to 8 instances
    ./deploy.sh logs caddy          # View Caddy logs
    ./deploy.sh tunnel-setup        # Setup Cloudflare tunnel

EOF
}

cleanup() {
	log_warn "This will remove ALL containers and volumes!"
	read -p "Are you sure? [y/N] " -n 1 -r
	echo ""
	if [[ $REPLY =~ ^[Yy]$ ]]; then
		cd "$SCRIPT_DIR"
		docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v
		log_success "Cleanup complete"
	else
		log_info "Cancelled"
	fi
}

# Main
case "${1:-help}" in
install)
	check_prerequisites
	init_env
	build_image
	PROFILE="$(ask_cloudflare_profile)"
	start_services "$PROFILE"
	show_health
	;;
start)
	check_prerequisites
	init_env
	PROFILE="$(ask_cloudflare_profile)"
	start_services "$PROFILE"
	;;
stop)
	stop_services
	;;
restart)
	init_env
	PROFILE="$(ask_cloudflare_profile)"
	stop_services
	sleep 2
	start_services "$PROFILE" "${2:-$DEFAULT_REPLICAS}"
	;;
scale)
	scale_instances "$2"
	;;
status)
	show_status
	;;
logs)
	show_logs "$2" "$3"
	;;
health)
	show_health
	;;
update)
	update_image
	;;
tunnel-setup)
	init_env
	setup_cloudflare_tunnel
	;;
cleanup)
	cleanup
	;;
help | --help | -h)
	show_help
	;;
*)
	log_error "Unknown command: $1"
	show_help
	exit 1
	;;
esac

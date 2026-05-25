# Docker

This project ships with a `Dockerfile` for building and running AxonRouter in a container.

## Build image

```bash
docker build -t axonrouter .
```

## Start container

```bash
docker run --rm \
  -p 12711:12711 \
  -v "$HOME/.axonrouter:/home/node/.axonrouter" \
  --name axonrouter \
  axonrouter
```

The app listens on port `12711` in the container.

## What the volume does

```bash
-v "$HOME/.axonrouter:/home/node/.axonrouter"
```

`axonrouter` stores runtime state in the current user's AxonRouter home directory. In the container, that path is `/home/node/.axonrouter`.

With the example above, the database file is:

```text
/home/node/.axonrouter/db.sqlite
```

and it is persisted on the host at:

```text
$HOME/.axonrouter/db.sqlite
```

## Stop container

```bash
docker stop axonrouter
```

## Run in background

```bash
docker run -d \
  -p 12711:12711 \
  -v "$HOME/.axonrouter:/home/node/.axonrouter" \
  --name axonrouter \
  axonrouter
```

## View logs

```bash
docker logs -f axonrouter
```

## Optional environment variables

You can override runtime env vars with `-e`.

Example:

```bash
docker run --rm \
  -p 12711:12711 \
  -v "$HOME/.axonrouter:/home/node/.axonrouter" \
  -e PORT=12711 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name axonrouter \
  axonrouter
```

## Rebuild after code changes

```bash
docker build -t axonrouter .
```

Then restart the container.

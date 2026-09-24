docker stop axonrouter-web 2>/dev/null || true
docker rm axonrouter-web 2>/dev/null || true
docker build -t axonrouter-web .
docker run -d --name axonrouter-web -p 3777:3777 --env-file .env -v axonrouter-data:/app/data axonrouter-web

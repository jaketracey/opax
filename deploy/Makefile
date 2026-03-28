# =============================================================================
# OPAX Deployment Makefile
#
# Usage:
#   make deploy IP=13.55.123.45
#   make sync-data IP=13.55.123.45
#   make restart IP=13.55.123.45
#   make logs IP=13.55.123.45
#   make status IP=13.55.123.45
# =============================================================================

# Configuration
IP ?= $(error Set IP=<ec2-ip> e.g. make deploy IP=13.55.123.45)
KEY ?= ~/.ssh/opax-key.pem
USER ?= ubuntu
SSH = ssh -i $(KEY) -o StrictHostKeyChecking=no $(USER)@$(IP)
SCP = scp -i $(KEY) -o StrictHostKeyChecking=no

.PHONY: help deploy sync-data restart stop start logs status ssh setup-instance update-code update-nginx \
       docker-build docker-up docker-down docker-logs docker-deploy docker-pipeline docker-shell

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

deploy: setup-instance sync-data restart ## Full deploy: setup + data + restart

setup-instance: ## Run setup.sh on a fresh EC2 instance
	$(SCP) setup.sh $(USER)@$(IP):~/setup.sh
	$(SSH) 'chmod +x ~/setup.sh && sudo ~/setup.sh'

sync-data: ## Sync SQLite DB and embeddings to EC2
	bash sync-data.sh $(IP) $(KEY)

update-code: ## Pull latest code on EC2 and rebuild
	$(SSH) 'cd /opt/opax && sudo -u opax git pull'
	$(SSH) 'cd /opt/opax && sudo -u opax bash -c "source .venv/bin/activate && uv pip install -e ."'
	$(SSH) 'cd /opt/opax/opax && sudo -u opax npm ci --production=false && sudo -u opax npm run build'
	$(SSH) 'sudo systemctl restart opax-api opax-web'

update-nginx: ## Update nginx config and reload
	$(SCP) nginx.conf $(USER)@$(IP):/tmp/opax-nginx.conf
	$(SSH) 'sudo mv /tmp/opax-nginx.conf /etc/nginx/sites-available/opax.com.au && sudo nginx -t && sudo systemctl reload nginx'

restart: ## Restart both services
	$(SSH) 'sudo systemctl restart opax-api opax-web'

stop: ## Stop both services
	$(SSH) 'sudo systemctl stop opax-api opax-web'

start: ## Start both services
	$(SSH) 'sudo systemctl start opax-api opax-web'

logs: ## Tail logs for both services (Ctrl+C to stop)
	$(SSH) 'sudo journalctl -u opax-api -u opax-web -f --no-pager'

logs-api: ## Tail API logs only
	$(SSH) 'sudo journalctl -u opax-api -f --no-pager'

logs-web: ## Tail web logs only
	$(SSH) 'sudo journalctl -u opax-web -f --no-pager'

status: ## Show status of both services
	$(SSH) 'sudo systemctl status opax-api opax-web --no-pager'
	@echo ""
	$(SSH) 'echo "--- Disk Usage ---" && df -h / && echo "" && echo "--- Memory ---" && free -h && echo "" && echo "--- Data Files ---" && ls -lh /opt/opax/data/ 2>/dev/null || echo "No data files yet"'

ssh: ## Open SSH session to EC2
	ssh -i $(KEY) $(USER)@$(IP)

certbot-setup: ## Run certbot for SSL (DNS must point to server)
	$(SSH) 'sudo certbot --nginx -d opax.com.au -d www.opax.com.au --non-interactive --agree-tos -m admin@opax.com.au'
	$(SSH) 'sudo rm -f /etc/nginx/sites-enabled/opax-temp.conf'
	$(SSH) 'sudo ln -sf /etc/nginx/sites-available/opax.com.au /etc/nginx/sites-enabled/'
	$(SSH) 'sudo nginx -t && sudo systemctl reload nginx'

# =============================================================================
# Docker Commands (local and EC2)
# =============================================================================

COMPOSE = docker compose -f $(shell dirname $(MAKEFILE_LIST))/../docker-compose.yml

docker-build: ## Build all Docker images
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose build

docker-up: ## Start all services (detached)
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose up -d

docker-down: ## Stop all services
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose down

docker-logs: ## Tail logs for all services
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose logs -f

docker-pipeline: ## Run the daily pipeline (one-shot)
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose run --rm pipeline

docker-shell: ## Open a shell in the API container
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose exec api bash

docker-deploy: ## Full Docker deploy: build, push data, start
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose build
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose down
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose up -d
	@echo ""
	@echo "OPAX Docker stack is running."
	@echo "  API:   http://localhost:8000"
	@echo "  Web:   http://localhost:3000"
	@echo "  Nginx: http://localhost:80"

docker-deploy-ec2: ## Deploy Docker stack to EC2
	$(SCP) -r ../Dockerfile.api ../Dockerfile.web ../Dockerfile.pipeline ../docker-compose.yml $(USER)@$(IP):/opt/opax/
	$(SCP) nginx-docker.conf $(USER)@$(IP):/opt/opax/deploy/
	$(SSH) 'cd /opt/opax && docker compose build && docker compose up -d'

docker-certbot: ## Obtain SSL cert via Docker certbot (production)
	cd $(shell dirname $(MAKEFILE_LIST))/.. && docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d opax.com.au -d www.opax.com.au --agree-tos -m admin@opax.com.au
	@echo "Uncomment the HTTPS server block in deploy/nginx-docker.conf, then:"
	@echo "  docker compose restart nginx"

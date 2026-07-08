#!/bin/sh
set -eu

domain_name="${DOMAIN_NAME:-example.com}"
www_domain="${WWW_DOMAIN:-www.example.com}"
email_address="${LETSENCRYPT_EMAIL:-admin@example.com}"

docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$email_address" \
  --agree-tos \
  --no-eff-email \
  -d "$domain_name" \
  -d "$www_domain"

docker compose up -d nginx certbot
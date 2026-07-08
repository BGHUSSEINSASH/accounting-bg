#!/bin/sh
set -eu

domain_name="${DOMAIN_NAME:-example.com}"
secondary_domain="${WWW_DOMAIN:-www.example.com}"
nginx_container="${NGINX_CONTAINER_NAME:-accounting-nginx}"
webroot_path="${CERTBOT_WEBROOT:-/var/www/certbot}"

while :; do
  certbot renew \
    --webroot -w "$webroot_path" \
    --quiet \
    --deploy-hook "docker exec $nginx_container nginx -s reload"

  sleep 12h &
  wait $!
done
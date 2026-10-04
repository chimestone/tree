#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]]
test -f /opt/tree-system/server.js
test -f /var/lib/tree-system/database.json
id treeapp >/dev/null 2>&1 || useradd --system --home-dir /var/lib/tree-system --shell /usr/sbin/nologin treeapp
chown -R treeapp:treeapp /var/lib/tree-system
chmod 700 /var/lib/tree-system
chmod 600 /var/lib/tree-system/database.json
if [[ ! -f /etc/tree-system.env ]]; then
    umask 077
    secret=$(openssl rand -hex 32)
    printf 'NODE_ENV=production\nHOST=127.0.0.1\nPORT=3145\nDB_FILE=/var/lib/tree-system/database.json\nSECRET=%s\n' "$secret" > /etc/tree-system.env
    unset secret
fi
chmod 600 /etc/tree-system.env
cd /opt/tree-system
npm ci --omit=dev --no-audit --no-fund
install -m 644 deploy/tree.service /etc/systemd/system/tree.service
install -m 644 deploy/tree.nginx.conf /etc/nginx/sites-available/tree
nginx -t
ln -sfn /etc/nginx/sites-available/tree /etc/nginx/sites-enabled/tree
if ! nginx -t; then
    unlink /etc/nginx/sites-enabled/tree
    exit 1
fi
systemctl daemon-reload
systemctl enable --now tree
systemctl reload nginx
systemctl is-active tree nginx
curl --fail --silent --retry 5 --retry-connrefused --retry-delay 1 --output /dev/null http://127.0.0.1:3145/api/graph
echo 'Deployment health check passed.'

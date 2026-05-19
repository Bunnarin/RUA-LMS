this is for the nocobase multiapp on a single vps. to setup just migrate the .sql file (which defines the app config) to the respective sub app db

apt update
apt install certbot python3-certbot-nginx nginx git postgresql postgresql-client

follow this instruction https://docs.docker.com/engine/install/

git clone repo

<!-- setup nginx config -->
add this in /etc/nginx/conf.d/your_domain.conf
```
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://127.0.0.1:13000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_buffering off;
    }
}
```

nginx -t
systemctl reload nginx
certbot --nginx -d your_domain.com

<!-- postgres setup (tedious bcuz we access the host from the container, it'd be easier if we use container db) -->
sudo -i -u postgres psql
\password postgres
CREATE DATABASE ...

add this to /etc/postgresql/<version>/main/postgresql.conf
listen_addresses = '*'

add this to /etc/postgresql/<version>/main/pg_hba.conf
host        all         all         172.18.0.0/16       scram-sha-256

<!-- restore the db -->
pg_restore -h localhost -U <user> -d <db> ./path/to/your_backup_file.sql

<!-- make sure ./storage exist, or else it'll create as root user (which will cause problem) -->
docker run -d \
  --name lms \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/storage:/app/nocobase/storage" \
  -p 13000:80 \
  nocobase/nocobase:latest
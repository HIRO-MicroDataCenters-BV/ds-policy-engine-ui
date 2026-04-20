FROM nginx:1.27-alpine

# Non-root nginx needs writable /tmp, /var/cache/nginx, /var/run (default behaviour
# of the alpine image is fine; we only override config + html + entrypoint).
COPY nginx.conf /etc/nginx/nginx.conf
COPY src/ /usr/share/nginx/html/
COPY docker-entrypoint.d/10-render-config.sh /docker-entrypoint.d/10-render-config.sh
RUN chmod +x /docker-entrypoint.d/10-render-config.sh

EXPOSE 8080
# CMD comes from the base nginx image: nginx -g 'daemon off;'

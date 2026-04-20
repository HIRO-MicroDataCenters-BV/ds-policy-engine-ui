FROM nginx:1.27-alpine

# nginx:alpine already ships envsubst (part of gettext in base image).
# We override the stock nginx.conf with our own via the template -> /etc/nginx/nginx.conf
# render that runs at container start (see docker-entrypoint.d/05-render-nginx-conf.sh).
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY src/ /usr/share/nginx/html/
# Canonical user guide source — served at /USER_GUIDE.md and fetched by help.html.
COPY docs/USER_GUIDE.md /usr/share/nginx/html/USER_GUIDE.md
COPY docker-entrypoint.d/05-render-nginx-conf.sh /docker-entrypoint.d/05-render-nginx-conf.sh
COPY docker-entrypoint.d/10-render-config.sh /docker-entrypoint.d/10-render-config.sh
RUN chmod +x /docker-entrypoint.d/05-render-nginx-conf.sh \
           /docker-entrypoint.d/10-render-config.sh

# Defaults — overridable at runtime via chart / compose.
ENV BACKEND_URL="http://ds-policy-engine:8000"
ENV API_BASE_URL=""

EXPOSE 8080
# CMD comes from the base nginx image: nginx -g 'daemon off;'

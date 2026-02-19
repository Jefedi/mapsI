FROM nginx:1.27-alpine

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copier la config nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier la PWA
COPY docs/ /usr/share/nginx/html/

# Fix permissions for non-root
RUN chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /usr/share/nginx/html && \
    touch /var/run/nginx.pid && chown appuser:appgroup /var/run/nginx.pid

EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

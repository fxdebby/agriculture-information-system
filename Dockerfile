# Runs the app with PHP + Apache on hosts that build from a Dockerfile.
# Set the environment variables SUPABASE_URL and SUPABASE_ANON_KEY on the host.
FROM php:8.3-apache
RUN a2enmod headers
COPY . /var/www/html/
RUN rm -f /var/www/html/config.js /var/www/html/Dockerfile
EXPOSE 80

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build --chown=nginx:nginx /src/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx nginx.security-headers.conf /etc/nginx/security-headers.conf
COPY --chmod=755 --chown=nginx:nginx docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
USER nginx
EXPOSE 8080

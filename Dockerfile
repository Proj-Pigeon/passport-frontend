FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN pnpm build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.prod.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

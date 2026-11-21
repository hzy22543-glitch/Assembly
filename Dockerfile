FROM node:24-bookworm AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

FROM nginx:alpine

# 复制静态文件
COPY --from=build /app/dist/ /usr/share/nginx/html/

# 复制自定义Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露80端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Accept API Keys as build arguments
ARG GEMINI_API_KEY
ARG OPENROUTER_API_KEY
ENV VITE_GEMINI_API_KEY=$GEMINI_API_KEY
ENV VITE_OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY

COPY package*.json ./
RUN npm install

COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:stable-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

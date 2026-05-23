FROM denoland/deno:2.1.4

WORKDIR /app

COPY deno.json deno.json
COPY server server

EXPOSE 8787

CMD ["task", "server"]

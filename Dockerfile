FROM denoland/deno:2.1.4

WORKDIR /app

COPY deno.json deno.json
COPY server server
COPY src/data src/data
COPY src/shared/game src/shared/game

EXPOSE 8787

CMD ["task", "server"]

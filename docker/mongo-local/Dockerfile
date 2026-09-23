FROM mongo:7-jammy

COPY start-mongo-local.sh /usr/local/bin/start-mongo-local.sh
RUN chmod 0755 /usr/local/bin/start-mongo-local.sh

ENTRYPOINT ["/usr/local/bin/start-mongo-local.sh"]

FROM golang:1.22-alpine

RUN adduser -D runner
USER runner

COPY --chown=runner run.sh /run.sh

# /code mounted read-only at runtime with solution.go
# GOCACHE and GOTMPDIR redirected to /tmp so --read-only doesn't block compilation
CMD ["/run.sh"]

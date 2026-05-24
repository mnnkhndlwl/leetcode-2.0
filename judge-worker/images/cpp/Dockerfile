FROM alpine:3.20

RUN apk add --no-cache g++

RUN adduser -D runner
USER runner

COPY --chown=runner run.sh /run.sh

# /code mounted read-only at runtime with solution.cpp
# compiles to /tmp (tmpfs) then runs; stdin = test input
CMD ["/run.sh"]

FROM eclipse-temurin:21-jdk-alpine

RUN adduser -D runner
USER runner

COPY --chown=runner run.sh /run.sh

# /code mounted read-only at runtime with Main.java
# compiles class files into /tmp (tmpfs) then runs Main
CMD ["/run.sh"]

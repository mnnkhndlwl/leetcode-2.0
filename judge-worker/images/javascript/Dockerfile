FROM node:22-alpine

RUN adduser -D runner
USER runner

# /code is mounted read-only at runtime with the submission's solution.js
CMD ["node", "/code/solution.js"]

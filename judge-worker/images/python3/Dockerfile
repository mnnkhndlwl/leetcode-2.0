FROM python:3.12-alpine

# Drop to a non-root user for safety
RUN adduser -D runner
USER runner

# /code is mounted read-only at runtime with the submission's solution.py
# stdin = test case input, stdout = program output
CMD ["python3", "/code/solution.py"]

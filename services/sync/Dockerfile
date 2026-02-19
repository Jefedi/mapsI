FROM python:3.11-alpine
RUN pip install --no-cache-dir flask
WORKDIR /app
COPY server.py .
EXPOSE 8001
CMD ["python", "server.py"]

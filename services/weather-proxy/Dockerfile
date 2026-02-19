FROM python:3.11-alpine
RUN pip install --no-cache-dir flask requests
WORKDIR /app
COPY server.py .
EXPOSE 8003
CMD ["python", "server.py"]

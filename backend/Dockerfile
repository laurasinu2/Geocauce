FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --system --uid 10001 --home /srv app \
 && mkdir -p /data/files && chown -R 10001:10001 /data /srv
COPY --chown=10001:10001 geocauce_api ./geocauce_api
USER app
EXPOSE 8000
CMD ["uvicorn", "geocauce_api.app:app", "--host", "0.0.0.0", "--port", "8000"]

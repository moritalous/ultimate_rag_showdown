PATH=$PATH:$LAMBDA_TASK_ROOT/bin \
PYTHONPATH=$PYTHONPATH:/opt/python:$LAMBDA_RUNTIME_DIR \
exec python /opt/python/litellm/proxy/proxy_cli.py --model=$MODEL --port=$PORT
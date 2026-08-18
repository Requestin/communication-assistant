FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# Host-built llama-server needs OpenMP; the slim CUDA runtime image does not ship it.
# Model weights stay on the host volume — do not COPY the 22 GB GGUF into the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/llama

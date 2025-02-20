# Setup
This project uses `uv` to manage the dependencies.
To install the dependencies, run the following command:

```bash
uv sync
uv run upload-hface-dataset.py
```

# Instructions to finetune the model created from Together.AI

## 1. Download the model
- download the model from together.ai and extract to a local folder, eg: `hn-finetune-model`

## 2. Set up the environment

Download and build `llama.cpp`
```shell
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp

# For CUDA build
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release
```
For more details, refer to https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md

Install gguf
```shell
pip install gguf protobuf
```

## 3. Create GGUF version of the model
```shell

# To generate GGUF with Q8 quantization
python3 convert_hf_to_gguf.py <folder_where_model_is_extracted> --outfile <gguf_output_folder>/hn-finetune-llama-3-8.1b-lora-q8_0.gguf --outtype q8_0 

# To generate GGUF with BFloat16 quantization 
python3 convert_hf_to_gguf.py <folder_where_model_is_extracted> --outfile <gguf_output_folder>/hn-finetune-llama-3-8.1b-lora-bf16.gguf --outtype bf16

# To quantize to Q5_K_M using `llama-quantize' from llama cpp
cd llama.cpp/build/bin/

./llama-quantize ./hn-finetune-openpipe-llama-3-1-8b-lora-bf16.gguf ./hn-finetune-openpipe-llama-3-1-8b-lora-q5km.gguf Q5_K_M 
```
## 4. Infer the model using llama.cpp
Use the `llama-cli` from llama.cpp

```shell
cd llama.cpp/build/bin/

# To run fully on CPU, run:
./llama-cli -m <gguf_output_folder>/hn-finetune-llama-3-8.1b-lora-bf16.gguf -cnv -p "$(cat system-prompt.txt)" -f user-prompt.txt --ctx-size 16384

# To offload some layers to GPU
./llama-cli -m <gguf_output_folder>/hn-finetune-llama-3-8.1b-lora-bf16.gguf -cnv -p "$(cat system-prompt.txt)" -f user-prompt.txt --ctx-size 16384 -ngl 40
```
## 5. Infer the model using ollama

### 5.1 Create the ollama Modelfile
Create a file named `Modelfile` in the `gguf_output_folder` with the following content:
```
FROM ./hn-finetune-llama-3-8.1b-lora-bf16.gguf
# sets the temperature to 1 [higher is more creative, lower is more coherent]
PARAMETER temperature 1

# sets the context window size to 32768, this controls how many tokens the LLM can use as context to generate the next token
PARAMETER num_ctx 32768

# sets the system message to summarize HN comments
SYSTEM """You are an AI assistant specialized in summarizing Hacker News discussions. Analyze threaded comments with scores and reply counts. Focus on high-scoring and highly-replied comments to identify main themes and key insights.  Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Significant Viewpoints, Notable Side Discussions.  In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path like '[1.2]' and attribute the author."""
```

### 5.2 Build the Ollama model
```shell
ollama create hn-finetune-llama-3-8.1b-lora-bf16 -f ./Modelfile 
```

## Local Run - Observations
The following key observations were made by running the fine-tuning on different posts and configurations
These tests were done on 4090 machine on 16 Feb 2025

#### No truncation - 4 small posts, ctx window: 4096
- run_name: ann-Llama-3-8b-bnb-4bit_beast_4096_4small_posts
- model_name: hn-finetune-2
- result: training worked fine, completed in 100 secs. But inference runs endlessly

#### Truncating to 4000 chars - 4 small posts, ctx window: 4096
- run_name: ann-text-trunc-Llama-3-8b-bnb-4bit_beast_4096_4small_posts
- model_name: hn-finetune-text-truncated
- result: training worked fine, completed in 100 secs. But inference runs endlessly

#### No truncation - 2 medium, 4 small posts, ctx window: 4096
- run_name: ann-no-trunc-2medium_4small_posts_Llama-3-8b-bnb-4bit_beast_4096
- model_name: na
- result: the training got stuck at the beginning itself. No errors, no log message. Epoch runs did not start.

#### Truncating to 4000 chars - 2 medium, 4 small posts, ctx window: 4096
- run_name: ann-text-trunc-2medium_4small_posts_Llama-3-8b-bnb-4bit_beast_4096
- model_name: na
- result: training got stuck at the beginning. No errors, no log message. WandB log for global_step and train/epoch is empty

#### Truncating to 4000 chars - 1 medium, 4 small posts, ctx window: 4096
- run_name: ann-text-trunc-1medium_4small_posts_Llama-3-8b-bnb-4bit_beast_4096
- model_name: na
- result: training got stuck at the beginning. No errors, no log message. WandB log for global_step and train/epoch is empty

#### Truncating to 2000 chars - 1 medium, 4 small posts, ctx window: 8192
- run_name: <didn't generate any data>
- model_name: na
- result: training got stuck at the beginning. No errors, no log message. WandB log for global_step and train/epoch is empty

#### 4 small posts (different set of posts) ctx window: 4096
- run_name: ann-text-trunc-1medium_4small_posts_Llama-3-8b-bnb-4bit_beast_4096
- model_name: na
- result: training worked fine, completed in 100 secs. But inference runs endlessly

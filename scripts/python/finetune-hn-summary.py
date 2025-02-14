from unsloth import FastLanguageModel
import torch

max_seq_length = 4096 # Context length.
  # TODO: Increase to 8192 or higher to match the context window length of final model.
  # Refer https://unsloth.ai/blog/long-context. RTX 4090 can take upto 56K context length (input token)

dtype = None # None for auto detection. Float16 for Tesla T4, V100, Bfloat16 for Ampere+
load_in_4bit = True # Use 4bit quantization to reduce memory usage. Set to False for higher (1-2%) accuracy

# 4bit pre quantized models we support for 4x faster downloading + no OOMs.
fourbit_models = [
    "unsloth/mistral-7b-v0.3-bnb-4bit",      # New Mistral v3 2x faster!
    "unsloth/mistral-7b-instruct-v0.3-bnb-4bit",
    "unsloth/llama-3-8b-bnb-4bit",           # Llama-3 15 trillion tokens model 2x faster!
    "unsloth/llama-3-8b-Instruct-bnb-4bit",
    "unsloth/llama-3-70b-bnb-4bit",
    "unsloth/Phi-3-mini-4k-instruct",        # Phi-3 2x faster!
    "unsloth/Phi-3-medium-4k-instruct",
    "unsloth/mistral-7b-bnb-4bit",
    "unsloth/gemma-7b-bnb-4bit",             # Gemma 2.2x faster!
] # More models at https://huggingface.co/unsloth

# base_model_name = "unsloth/llama-3-8b-bnb-4bit"
# base_model_name = "unsloth/DeepSeek-R1-Distill-Llama-8B-unsloth-bnb-4bit"
# base_model_name = "unsloth/Llama-3.3-70B-Instruct-bnb-4bit"
base_model_name = "unsloth/Llama-3.2-3B-Instruct-bnb-4bit"

base_model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = base_model_name,
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit
    # token = "hf_...", # use one if using gated models like meta-llama/Llama-2-7b-hf
)

print(f"\nInitialized base model - name: {base_model.name_or_path}, max_seq_length: {max_seq_length}")


lora_model = FastLanguageModel.get_peft_model(
    base_model,
    r = 16, # Rank of the finetuning process. We can choose any number > 0. Suggested 8, 16, 32, 64, 128
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                      "gate_proj", "up_proj", "down_proj",],
    lora_alpha = 16, # Scaling factor for finetuning. A large number may cause overfitting.
    lora_dropout = 0, # Supports any, but = 0 is optimized
    bias = "none",    # Supports any, but = "none" is optimized
    use_gradient_checkpointing = "unsloth", # True or "unsloth" for very long context (uses 30% less VRAM, fits 2x larger batch sizes!)
    random_state = 3407, # number to determine deterministic runs
    use_rslora = False,  # rslora: rank stabilized LoRA
    loftq_config = None, # LoftQ - Advanced feature, can improve accuracy somewhat, but can make memory usage explode at the start.
)

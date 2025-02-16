### Setup
This project uses `uv` to manage the dependencies.
To install the dependencies, run the following command:

```bash
uv sync
uv run upload-hface-dataset.py
```

## Observations
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

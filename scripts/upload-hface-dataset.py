import os
from datasets import Dataset, DatasetDict
from typing import Dict, List
import glob
from getpass import getpass

def read_file_content(filepath: str) -> str:
    """Read and return file content."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read().strip()

def create_dataset_from_files(data_dir: str) -> Dataset:
    """
    Create a HuggingFace dataset from paired MD files.
    Expects files named as nnn_comments.md and nnn_summary.md
    """
    # Get all comment files
    comment_files = glob.glob(os.path.join(data_dir, "*_comments.md"))

    training_pairs = []
    print(f"Reading comments from folder data_dir: {data_dir}")

    for comment_file in comment_files:
        # Get corresponding summary file
        post_id = os.path.basename(comment_file).split('_')[0]
        summary_file = os.path.join(data_dir, f"{post_id}_summary.md")

        # Skip if summary file doesn't exist
        if not os.path.exists(summary_file):
            print(f"Warning: No summary file found for {comment_file}")
            continue

        # Read contents
        comments = read_file_content(comment_file)
        summary = read_file_content(summary_file)

        instruction = "Analyze and summarize the following Hacker News thread. The title of the post and comments are separated by dashed lines."

        # Add to training pairs
        training_pairs.append({
            "id": post_id,
            "instruction": instruction,
            "input_comment": comments,
            "output_summary": summary
        })

    # Create Dataset object
    dataset = Dataset.from_list(training_pairs)
    return dataset

def upload_to_hub(dataset_dict: DatasetDict,
                 repo_name: str,
                 private: bool = True):
    """
    Upload dataset to Hugging Face Hub.

    Args:
        dataset: The Dataset dictionary to upload
        repo_name: Name for the dataset (format: 'username/dataset-name')
        private: Whether to make the dataset private (default: True)
    """
    # Check if HuggingFace token is in environment
    if 'HF_TOKEN' not in os.environ:
        token = getpass("Enter your Hugging Face token: ")
        os.environ['HF_TOKEN'] = token

    dataset_dict.push_to_hub(
        repo_name,
        token=os.environ['HF_TOKEN'],
        private=private
    )

# Run the code to upload the data to HuggingFace

# Configuration
TRAINING_DATA_DIR = "datasets/training_data"  # Directory containing your MD files for training
VALIDATION_DATA_DIR = "datasets/validation_data"  # Directory containing your MD files for validation

REPO_NAME = "annjose/hn-comments-new"   # Your desired dataset name

# Create and upload training dataset and validation dataset
# train_dataset = create_dataset_from_files(TRAINING_DATA_DIR)
# val_dataset = create_dataset_from_files(VALIDATION_DATA_DIR)
#
# # Create a DatasetDict with both train and val datasets
# dataset_dict = DatasetDict({
#     'train': train_dataset,
#     'val': val_dataset
# })
#
# import json

# Print train dataset info
# print("\nTraining Dataset Preview:")
# print(train_dataset)
# print("\nTraining Dataset First example:")
# print(json.dumps(train_dataset[0], indent=2))
#
# # Print val dataset info
# print("\nValidation Dataset Preview:")
# print(val_dataset)
# print("\nValidation Dataset First example:")
# print(json.dumps(val_dataset[0], indent=2))

# Upload to HuggingFace
# upload_to_hub(
#     dataset_dict=dataset_dict,
#     repo_name=REPO_NAME,
#     private=True
# )

query = 'select post_id, post_formatted_comments as input_comment, llm_response_summary as output_summary from posts_comments where post_id=42584896;'
uri = "sqlite:///data/hn_posts.db"
dataset = Dataset.from_sql("states", uri)
print(dataset)

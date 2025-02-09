import os
from datasets import Dataset, DatasetDict
from getpass import getpass
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def upload_to_hub(dataset_dict: DatasetDict,
                 repo_name: str,
                 private: bool = True):
    """
    Upload dataset to Hugging Face Hub.

    Args:
        dataset_dict: The Dataset dictionary to upload
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


if __name__ == "__main__":
    REPO_NAME = "annjose/hn-comments-new"  # Your desired dataset name
    # query = 'select post_id, post_formatted_comments as input_comment, llm_response_summary as output_summary from posts_comments where post_id=42584896;'
    query = '''
        select post_id,
               post_formatted_comments as input_comment,
               llm_response_summary as output_summary
        from posts_comments
        where post_id in (42584896, 42606773, 42607623, 42609595, 42609819)  -- if you want specific posts
        -- or simply remove the where clause to get all posts
    '''

    uri = "sqlite:///../data/hn_posts.db"
    dataset = Dataset.from_sql(query, uri)

    print(f"Total records in dataset: {len(dataset)}")
    print(f"Dataset structure: {dataset}")

    # Split the dataset
    split_dataset = dataset.train_test_split(test_size=0.2, seed=42)

    # Create a DatasetDict
    dataset_dict = DatasetDict({
        'train': split_dataset['train'],
        'validation': split_dataset['test']
    })


    upload_to_hub(
        dataset_dict=dataset_dict,
        repo_name=REPO_NAME,
        private=True
    )
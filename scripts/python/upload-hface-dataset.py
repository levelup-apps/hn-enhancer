import os
from datasets import Dataset, DatasetDict, load_dataset
from getpass import getpass
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

HF_REPO_NAME = "annjose/hn-comments-new"  # Your desired dataset name

def upload_from_db_to_hface():

    # get an array of post_ids and convert into a string separated by comma
    post_ids = [42607623, 42607794, 42608155, 42608436, 42608923, 42609595, 42609819, 42611536]
    post_ids_str = ','.join(str(post_id) for post_id in post_ids)

    query = f'''
        select post_id,
               '---- Post Title: \n' || post_title || '\n----- Comments: \n' || post_formatted_comments as input_comment,
               llm_response_summary as output_summary
        from posts_comments
        where post_id in ({post_ids_str})
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

    dataset_dict.push_to_hub(
        HF_REPO_NAME,
        token=os.environ['HF_TOKEN'],
        private=True
    )

def delete_from_hface():
    # Delete validation dataset
    dataset = load_dataset(HF_REPO_NAME)

    # Create a new DatasetDict with an empty validation set
    new_dataset = DatasetDict({
        'train': Dataset.from_dict({}),
        'validation': Dataset.from_dict({})  # Empty dataset
    })

    # Push the modified dataset back to Hub
    new_dataset.push_to_hub(HF_REPO_NAME)

    print(f"Original size: {len(dataset['validation'])}")
    print(f"New dataset: {new_dataset}")

if __name__ == "__main__":

    # Check if HuggingFace token is in environment
    if 'HF_TOKEN' not in os.environ:
        token = getpass("Enter your Hugging Face token: ")
        os.environ['HF_TOKEN'] = token

    upload_from_db_to_hface()

    # delete_from_hface()

    # dataset = load_dataset(HF_REPO_NAME)
    # print(f"Dataset size: {len(dataset['validation'])}")

import os
from datasets import Dataset, DatasetDict, Features, Value, load_dataset
from getpass import getpass
from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo, delete_repo

# Load environment variables from .env file
load_dotenv()

hf_api = HfApi()

def check_hface_dataset_exists():
    try:
        print(f"...Getting info of dataset '{HF_REPO_NAME}' ...")
        repo_info = hf_api.repo_info(repo_id=HF_REPO_NAME, repo_type="dataset")
        return repo_info
    except Exception as e:
        if "404 client error" in str(e).lower():
            # print the message that dataset does not exist.
            # Do no rethrow the exception. Return None so that the caller can create a repo if needed.
            print(f"...Dataset {HF_REPO_NAME} does not exist")
            return None
        else:
            # Re-raise any other exception
            raise Exception(f"Error checking dataset existence. Exception thrown by HF API repo_info(): {e}")

def create_hface_dataset():
    try:
        print(f"\nCreating dataset '{HF_REPO_NAME}' ...")
        repo_url = create_repo(
            repo_id=HF_REPO_NAME,
            repo_type="dataset",
            private=False,
            token=os.environ['HF_TOKEN']
        )
        print(f"Successfully created dataset. URL: {repo_url}")
    except Exception as e:
        raise Exception(f"Error creating dataset. Exception thrown by HF API create_repo(): \n---(exc_start)---\n{e}\n---(exc_end)---")

def initialize_hface_dataset():
    try:
        # Define features schema for empty dataset
        features = Features({
            'post_id': Value('string'),
            'input_comment': Value('string'),
            'output_summary': Value('string')
        })

        # Create empty example that matches the schema
        empty_example = {
            'post_id': ['000'],
            'input_comment': ['one'],
            'output_summary': ['one']
        }

        # Create empty datasets with schema
        empty_train_dataset = Dataset.from_dict(empty_example, features=features)
        empty_validation_dataset = Dataset.from_dict(empty_example, features=features)
        empty_test_dataset = Dataset.from_dict(empty_example, features=features)

        # Create DatasetDict with both splits
        empty_dataset = DatasetDict({
            'train': empty_train_dataset,
            'validation': empty_validation_dataset,
            'test': empty_test_dataset
        })

        # Push empty dataset with schema to Hub
        empty_dataset.push_to_hub(
            HF_REPO_NAME,
            token=os.environ['HF_TOKEN'],
            private=False
        )
        print(f"Initialized dataset {HF_REPO_NAME} by uploading empty dataset with schema")
    except Exception as e:
        raise Exception(f"Error intializing dataset. Exception: \n---(exc_start)---\n{e}\n---(exc_end)---")

def load_hface_dataset():
    try:
        print(f"...Loading dataset '{HF_REPO_NAME}' ...")
        dataset_dict = load_dataset(HF_REPO_NAME, token=os.environ['HF_TOKEN'])
        print(f"...Successfully loaded dataset")

        splits = dataset_dict.keys()
        print(f"...Dataset {HF_REPO_NAME} size:{len(dataset_dict)}, Number of splits: {splits}")

        for split in splits:
            print(f"...Split '{split}', size: {len(dataset_dict[split])}.")
            split_dataset = load_dataset(HF_REPO_NAME, split=split, token=os.environ['HF_TOKEN'])
            if len(split_dataset) > 0:
                print(f"...Split: '{split}' First row: {split_dataset[0]}")
            else:
                print(f"...Split: '{split}'No rows")

        # print(f"Full dataset info: size:{len(dataset)}. dataset: \n{dataset}")
        return dataset_dict

    except Exception as e:
        raise Exception(f"Error loading dataset {HF_REPO_NAME}. Exception thrown by HF API load_dataset(): \n\t---(exc_start)---\n\t{e}\n\t---(exc_end)---")

def get_datarow(dataset, post_id, split = None):
    # Load the data row for the given post_id from the given split. If split is not given, use train
    if split is None:
        split = "train"

    datarow_000 = dataset[split].filter(lambda x: x['post_id'] == post_id)
    if len(datarow_000) == 0:
        print(f"...No row for post_id: {post_id}, split: {split}")
    else :
        print(f"...Row found for post_id: {post_id}. \n...Row data: \n\t{datarow_000}")

    return datarow_000

def upload_dataset_from_db():

    print("\nPreparing dataset to upload to HF...")

    # Create test dataset with two posts (use dummy date for testing)
    test_post_ids = ['001', '002']
    test_data = {
        'post_id': test_post_ids,
        'input_comment': [
            'Test comment 1 for post_id: 001',
            'Test comment 2 for post_id: 002'
        ],
        'output_summary': [
            'Summary 1 for post_id: 001',
            'Summary 2 for post_id: 002'
        ]
    }
    # test_dataset = Dataset.from_dict(test_data)
    # print(f"Test dataset size: {len(test_dataset)}")

    # select a few post ids for training/validation and one for testing
    # train_post_ids = ['42607794', '42608436']
    train_post_ids = [42607623, 42607794, 42608155, 42608436, 42608923, 42609595, 42609819, 42611536]
    # 42607623 and 42608155 have length > 120K
    train_post_ids = [42607794, 42608436, 42608923, 42609595, 42609819, 42611536]
    test_post_ids = ['42611540']

    # After testing, reverse this logic - keep a few aside for testing; everything else include in training set
    # Convert test_post_ids array into SQL string format ('001', '002') so that they can be excluded from train/val set
    # use with - where post_id not in {test_ids_sql}
    test_ids_sql = "('" + "', '".join(test_post_ids) + "')"

    # create test dataset from the train post ids
    train_post_ids_str = ','.join(str(post_id) for post_id in train_post_ids)
    query = f'''
        select cast(post_id as text) as post_id,
               '---- Post Title: \n' || post_title || '\n----- Comments: \n' || post_formatted_comments as input_comment,
               llm_response_summary as output_summary
        from posts_comments
        where post_id in ({train_post_ids_str})
    '''
    # print(f"query for train and val: {query}")

    uri = "sqlite:///../data/hn_posts.db"
    dataset = Dataset.from_sql(query, uri)

    print(f"Dataset from sqlite query (for training): {dataset}")

    # create test dataset from the test post ids
    test_post_ids_str = ','.join(str(post_id) for post_id in test_post_ids)
    query_test_data = f'''
            select cast(post_id as text) as post_id,
                   '---- Post Title: \n' || post_title || '\n----- Comments: \n' || post_formatted_comments as input_comment,
                   llm_response_summary as output_summary
            from posts_comments
            where post_id in ({test_post_ids_str})
        '''
    test_dataset = Dataset.from_sql(query_test_data, uri)
    print(f"Dataset from sqlite query (for testing): {test_dataset}")

    # Verify that data was loaded into the dataset and it conforms to the schema
    if len(dataset) == 0:
        raise ValueError("No records found in database for given post_ids")
    expected_features = ['post_id', 'input_comment', 'output_summary']

    for feature in expected_features:
        if feature not in dataset.features:
            raise ValueError(f"Missing expected feature: {feature}")

    print(f"Dataset is valid and ready to upload. \n Size: {len(dataset)}. \n Features: {dataset.features}.")

    # Split the remaining data 80-20 for train/validation
    split_dataset = dataset.train_test_split(test_size=0.2, seed=42)

    # Create the final DatasetDict
    dataset_dict = DatasetDict({
        'train': split_dataset['train'],
        'validation': split_dataset['test'],
        'test': test_dataset
    })
    print(f" Number of splits: {dataset_dict.keys()}")
    print(f" Train size: {len(dataset_dict['train'])}, Validation size: {len(dataset_dict['validation'])}, Test size: {len(test_dataset)}")

    print(f"Post Ids for training: \t{dataset_dict['train']['post_id']}")
    print(f"Post Ids for validation: \t{dataset_dict['validation']['post_id']}")
    print(f"Post Ids for testing: \t{dataset_dict['test']['post_id']}")

    try:
        print(f"Uploading to HF repo: {HF_REPO_NAME} ...")
        dataset_dict.push_to_hub(
            HF_REPO_NAME,
            token=os.environ['HF_TOKEN'],
            private=False
        )
    except Exception as e:
        raise Exception(f"Error uploading dataset: Exception thrown by HF API push_to_hub() \n\t---(exc_start)---\n\t{e}\n\t---(exc_end)---")

def empty_hface_dataset(dataset_dict):
    # create a new dataset with the same features but with empty lists - one each for train, val and test
    features = dataset_dict['train'].features

    # Create empty example with the same structure
    empty_example = {
        'post_id': [],
        'input_comment': [],
        'output_summary': []
    }

    new_dataset = DatasetDict({
        'train': Dataset.from_dict(empty_example, features=features),
        'validation': Dataset.from_dict(empty_example, features=features),
        'test': Dataset.from_dict(empty_example, features=features)
    })

    # Push the modified dataset back to Hub
    new_dataset.push_to_hub(HF_REPO_NAME)

    print(f"New dataset: {new_dataset}")

def delete_hface_dataset():
    print(f"Deleting dataset: {HF_REPO_NAME} ...")

    try:
        delete_repo(
            repo_id=HF_REPO_NAME,
            repo_type="dataset",
            token=os.environ['HF_TOKEN']
        )
        print(f"Successfully deleted repository {HF_REPO_NAME}")
    except Exception as e:
        print(f"Error deleting repository: Exception thrown by delete_repo(): {e}")

## Main function
if __name__ == "__main__":

    # HF_REPO_NAME = "annjose/hn-comments-new"  # Your desired dataset name
    HF_REPO_NAME = "annjose/hn-comments-small"  # Your desired dataset name

    # Check if HuggingFace token is in environment
    if 'HF_TOKEN' not in os.environ:
        token = getpass("Enter your Hugging Face token: ")
        os.environ['HF_TOKEN'] = token

    try:

        # delete_hface_dataset()

        print(f"\nChecking if dataset exists: {HF_REPO_NAME} ...")
        dataset_info = check_hface_dataset_exists()

        if dataset_info:
            print(f"Found dataset with id: {dataset_info.id}. is_private: {dataset_info.private}")
        else :
            print(f"Dataset does not exist, creating new one ...")
            create_hface_dataset()
            print(f"Create success. Initializing the new dataset ...")
            initialize_hface_dataset()

        # print(f"\nChecking if dataset is valid: {HF_REPO_NAME} ...")
        # post_dataset_dict = load_hface_dataset()

        # # look up a post id in the dataset
        # test_post_id = '000'
        # print(f"\nLooking up post_id {test_post_id}...")
        # post_datarow = get_datarow(post_dataset_dict, test_post_id, 'test')

        # # You can access the row in many ways:
        # # - post_datarow[0] gives a row {'post_id': '000', 'input_comment': 'one', 'output_summary': 'one'}
        # # - post_datarow['post_id'] gives an array of all post_id's
        # # - post_datarow['post_id'][0] and post_datarow[0]['post_id'] gives the first post_id
        # print(f"Row data: post_datarow[0]: {post_datarow[0]}), ",
        #       f"\n\tpost_id: post_datarow['post_id'][0] = {post_datarow['post_id'][0]} = post_datarow[0]['post_id'] = {post_datarow[0]['post_id']}, ",
        #       f"\n\tinput_comment={post_datarow['input_comment'][0]}")

        upload_dataset_from_db()

        # empty_hface_dataset(post_dataset_dict)
        # delete_hface_dataset()

    except Exception as e:
        print(f"Exception in main code flow: {e}")

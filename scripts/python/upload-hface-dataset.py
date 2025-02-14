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
        initial_example = {
            'post_id': '000',
            'input_comment': 'one comment',
            'output_summary': 'one summary'
        }

        # Create empty datasets with schema
        train_dataset = Dataset.from_dict({
              'post_id': [initial_example['post_id']],
              'input_comment': [initial_example['input_comment']],
              'output_summary': [initial_example['output_summary']]
          }, features=features)
        validation_dataset = Dataset.from_dict({
               'post_id': [initial_example['post_id']],
               'input_comment': [initial_example['input_comment']],
               'output_summary': [initial_example['output_summary']]
           }, features=features)
        test_dataset = Dataset.from_dict({
             'post_id': [initial_example['post_id']],
             'input_comment': [initial_example['input_comment']],
             'output_summary': [initial_example['output_summary']]
         }, features=features)

        # Create DatasetDict with both splits
        initial_dataset = DatasetDict({
            'train': train_dataset,
            'validation': validation_dataset,
            'test': test_dataset
        })

        # Push empty dataset with schema to Hub
        initial_dataset.push_to_hub(
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
            print(f"\n...Split '{split}', size: {len(dataset_dict[split])}.")
            split_dataset = load_dataset(HF_REPO_NAME, split=split, token=os.environ['HF_TOKEN'])
            if len(split_dataset) > 0:
                print(f"...  First row:"
                      f"\n      post_id: {split_dataset[0]['post_id']}"
                      f"\n      input_comment: {split_dataset[0]['input_comment'][:100]}..."
                      f"\n      output_summary: {split_dataset[0]['output_summary'][:100]}...")
            else:
                print(f"...No rows")

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

def upload_sample_set_from_db():

    # Create test dataset with two posts (use dummy date for testing)
    #test_post_ids = ['001', '002']
    #test_data = {
    #    'post_id': test_post_ids,
    #    'input_comment': [
    #        'Test comment 1 for post_id: 001',
    #        'Test comment 2 for post_id: 002'
    #    ],
    #    'output_summary': [
    #        'Summary 1 for post_id: 001',
    #        'Summary 2 for post_id: 002'
    #    ]
    #}
    # test_dataset = Dataset.from_dict(test_data)
    # print(f"Test dataset size: {len(test_dataset)}")

    # Create a dataset from SQLite DB

    # Ultimately, for real testing, we will upload all the rows in the table to HuggingFace,
    #  with a split of train, validation and test datasets. At that time, we will set aside a few posts for the test set
    #  and put everything else in training and validation sets (as 80-20 split).
    #  We will use the following SQL fragment to get all the posts other than the posts for test dataset.
    #     test_post_ids = ['123', '456', '789']
    #     test_ids_sql = "('" + "', '".join(test_post_ids) + "')"
    #     query = f'''select cast ... where post_id not in {test_ids_sql}'''

    # But for now for testing purpose, we will handpick a few post ids and upload them as train, validation and test.
    # Select a few post ids for training/validation and one for testing
    # sample_train_val_post_ids = [42607623, 42607794, 42608155, 42608436, 42608923, 42609595, 42609819, 42611536]

    # sample of small and big posts ()42607623 and 42608155 have length > 120K)
    # sample_train_val_post_ids = [42607794, 42608436, 42608923, 42609595, 42609819, 42611536]

    # sample of posts with length between 5000 and 6000, and have threads with <replies: 6> or <replies: 7>
    # sample_train_val_post_ids = [42889786, 42884556]
    sample_train_val_post_ids = [42889786, 42884556, 42681762, 42864221, 42684257, 42901616, 42803774, 42931109]
    # sample_train_val_post_ids = []

    # Select a specific one for test dataset
    sample_test_post_ids = [42866572]
    # sample_test_post_ids = []

    print(f"Sample post Ids for training/validation: {sample_train_val_post_ids}")
    print(f"Sample post Ids for test: {sample_test_post_ids}")
    upload_dataset_from_db(sample_train_val_post_ids, sample_test_post_ids)

def upload_dataset_from_db(train_val_post_ids, test_post_ids):

    print("\nPreparing dataset to upload to HF...")

    if len(train_val_post_ids) > 0:
        # create train+val dataset from the train post ids
        train_val_post_ids_str = ','.join(str(post_id) for post_id in train_val_post_ids)
        query = f'''
            select cast(post_id as text) as post_id,
                   '---- Post Title: \n' || post_title || '\n----- Comments: \n' || post_formatted_comments as input_comment,
                   llm_response_summary as output_summary
            from posts_comments
            where post_id in ({train_val_post_ids_str})
        '''
        # print(f"query for train and val: {query}")

        uri = "sqlite:///../data/hn_posts.db"

        print(f"Executing Dataset.from_sql() with train_val_post_ids_str: {train_val_post_ids_str}")
        train_val_dataset = Dataset.from_sql(query, uri)
        print(f"Dataset from sqlite query (for training and validation): {train_val_dataset}")

        # Verify that data was loaded into the dataset and it conforms to the schema
        if len(train_val_dataset) == 0:
            raise ValueError("No records found in database for given post_ids")

        expected_features = ['post_id', 'input_comment', 'output_summary']
        for feature in expected_features:
            if feature not in train_val_dataset.features:
                raise ValueError(f"Missing expected feature: {feature}")

        # Split the remaining data 80-20 for train/validation.
        # Note: datasets library's test split is intended to be used as validation set.
        if(len(train_val_dataset) > 1):
            split_dataset = train_val_dataset.train_test_split(test_size=0.2, seed=42)
            train_dataset = split_dataset['train']
            validation_dataset = split_dataset['test']
        else:
            # If there is only one post, we cannot split it into train and validation sets.
            #  So use the single-element list for training set and leave validation set as None
            train_dataset = train_val_dataset
            validation_dataset = None
    else:
        print("No training post ids provided. (train_val_post_ids is empty.)")
        train_dataset = None
        validation_dataset = None

    # create test dataset from the test post ids
    if(len(test_post_ids) > 0):
        test_post_ids_str = ','.join(str(post_id) for post_id in test_post_ids)
        query_test_data = f'''
                select cast(post_id as text) as post_id,
                       '---- Post Title: \n' || post_title || '\n----- Comments: \n' || post_formatted_comments as input_comment,
                       llm_response_summary as output_summary
                from posts_comments
                where post_id in ({test_post_ids_str})
            '''
        print(f"Executing Dataset.from_sql() with test_post_ids_str: {test_post_ids_str}")
        test_dataset = Dataset.from_sql(query_test_data, uri)
    else:
        # If there are no test post ids, create an empty dataset
        print(f"No test post ids provided. test_post_ids is empty. Creating empty test dataset")
        test_dataset = None

    print(f"\nTraining dataset:   {train_dataset}")
    print(f"Validation dataset: {validation_dataset}")
    print(f"Test dataset:       {test_dataset}")

    # Create the final DatasetDict to upload to HF
    # Add the train, validation and test datasets if they are non-empty
    dataset_dict_components = {}

    # Add train, validation and test datasets only if they have data
    if train_dataset and len(train_dataset) > 0:
        dataset_dict_components = {'train': train_dataset}
    if validation_dataset and len(validation_dataset) > 0:
        dataset_dict_components['validation'] = validation_dataset
    if test_dataset and len(test_dataset) > 0:
        dataset_dict_components['test'] = test_dataset

    # Create the final DatasetDict with only non-empty datasets
    if(dataset_dict_components) :
        dataset_dict = DatasetDict(dataset_dict_components)
    else:
        print(f"All datasets are empty. No data to upload to HF")
        return

    print(f"\nFull dataset info: size:{len(dataset_dict)}. dataset: {dataset_dict}")
    print(f"  Number of splits: {dataset_dict.keys()}")

    if 'train' in dataset_dict and dataset_dict['train'] is not None:
        print(f"  Train dataset: Size: {len(dataset_dict['train'])}. Post ids: {dataset_dict['train']['post_id']}")
    else:
        print("  Train dataset: empty")

    if 'validation' in dataset_dict and dataset_dict['validation'] is not None:
        print(f"  Validation dataset: Size: {len(dataset_dict['validation'])}. Post ids: {dataset_dict['validation']['post_id']}")
    else:
        print("  Validation dataset: empty")

    if 'test' in dataset_dict and dataset_dict['test'] is not None:
        print(f"  Test dataset: Size: {len(dataset_dict['test'])}. Post ids: {dataset_dict['test']['post_id']}")
    else:
        print("  Test dataset: empty")

    # Upload the dataset to HF
    try:
        print(f"Uploading to HF repo: {HF_REPO_NAME} ...")

        dataset_dict.push_to_hub(
            HF_REPO_NAME,
            token=os.environ['HF_TOKEN'],
            private=False
        )

        print(f"Successfully uploaded dataset to HF repo: {HF_REPO_NAME}")
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

#     HF_REPO_NAME = "annjose/hn-comments-new"  # Your desired dataset name
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

        # empty_hface_dataset(post_dataset_dict)
        # initialize_hface_dataset()

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

        # print(f"\nUploading sample dataset to {HF_REPO_NAME} ...")
        # upload_sample_set_from_db()

        # print(f"\nLoading the full dataset from {HF_REPO_NAME} ...")
        # upload_dataset_from_db()

        print(f"\nChecking if dataset is valid: {HF_REPO_NAME} ...")
        post_dataset_dict = load_hface_dataset()

        # empty_hface_dataset(post_dataset_dict)
        # delete_hface_dataset()

    except Exception as e:
        print(f"Exception in main code flow: {e}")

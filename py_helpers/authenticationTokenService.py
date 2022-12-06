# program to get and store auth token for Wyze Clients

import uuid
import os
import json
import datetime
from wyze_sdk import Client 

WYZE_AUTH_TIMEOUT_SECS = 24*60*60

def getAccessToken(wyzeEmail=None, wyzePassword=None):
    # check env
    if os.environ.get('WYZE_ACCESS_TOKEN') is not None:
        # print(f"[WyzeAuth] Access token already set in env!")
        return

    # check disk
    username = wyzeEmail
    unique_id = 'homebridge-wyze-suite-' + username
    UUID = uuid.uuid5(uuid.NAMESPACE_URL, unique_id)
    fileName = str(UUID) + ".auth.json"

    if os.path.exists(fileName):
        with open(fileName, "r") as dataFile:
            credentials = json.load(dataFile)
            if 'WYZE_ACCESS_TOKEN' in credentials:
                # check timeout time
                previousTokenTimeStr = credentials['timestamp']
                dateTimeFormat = '%Y-%m-%d %H:%M'
                dateTimeObj: datetime = datetime.datetime.strptime(previousTokenTimeStr, dateTimeFormat)
                now = datetime.datetime.now()

                timeDifference: datetime = now - dateTimeObj
                # print(f"[WyzeAuth] Debug time diff: {timeDifference} ({timeDifference.total_seconds()} secs), timeout: {WYZE_AUTH_TIMEOUT_SECS}")

                if timeDifference.total_seconds() < WYZE_AUTH_TIMEOUT_SECS:
                    # print(f"[WyzeAuth] Access token found on disk for {username} ({fileName})!")
                    os.environ['WYZE_ACCESS_TOKEN'] = credentials['WYZE_ACCESS_TOKEN']
                    return
                # else:
                    # print(f"[WyzeAuth] Access token expired!")
    # else:
        # print(f"[WyzeAuth] Access token file does not exist!")

    # relogin
    setupWyzeTokens(wyzeEmail=wyzeEmail, wyzePassword=wyzePassword)



def setupWyzeTokens(wyzeEmail=None, wyzePassword=None):
    # UUID = uuid.uuid4()
    # print(f"[WyzeAuth] Access token setup, regenerating!!")
    if wyzeEmail is None or wyzePassword is None:
        # print(f"[WyzeAuth] Cannot generate tokens without credentials!")
        return

    response = Client().login(email=wyzeEmail, password=wyzePassword)
    currentAccessToken = response['access_token']
    currentRefreshToken = response['refresh_token']

    os.environ['WYZE_ACCESS_TOKEN'] = str(currentAccessToken)
    os.environ['WYZE_REFRESH_TOKEN'] = (currentRefreshToken)

    username = wyzeEmail

    unique_id = 'homebridge-wyze-suite-' + username
    UUID = uuid.uuid5(uuid.NAMESPACE_URL, unique_id)

    now = datetime.datetime.now()
    timestamp=str(now.strftime("%Y-%m-%d %H:%M"))


    data = {'WYZE_ACCESS_TOKEN': currentAccessToken,
            'WYZE_REFRESH_TOKEN': currentRefreshToken,
            'uuid': str(UUID),
            'timestamp': timestamp
            }

    # Serializing json
    json_object = json.dumps(data, indent=4)
    
    # Writing to sample.json
    fileName = str(UUID) + ".auth.json"
    with open(fileName, "w") as outfile:
        outfile.write(json_object)







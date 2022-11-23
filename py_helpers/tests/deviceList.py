import os
from wyze_sdk import Client
from wyze_sdk.errors import WyzeApiError

eml = 'carsonloyal123@me.com'
psswd = '@Lacylulu123!!'

client = Client(email=eml, password=psswd)

try:
    response = client.devices_list()
    for device in client.devices_list():
        print(f"mac: {device.mac}")
        print(f"nickname: {device.nickname}")
        print(f"is_online: {device.is_online}")
        print(f"product model: {device.product.model}")
        print(f"----------------------------------------")
except WyzeApiError as e:
    # You will get a WyzeApiError if the request failed
    print(f"Got an error: {e}")
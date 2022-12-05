import os
import sys
import json
import logging
import wyze_sdk
from wyze_sdk import Client
from wyze_sdk.errors import WyzeApiError
from authenticationTokenService import getAccessToken

if len(sys.argv) != 4 :
    sys.stdout = sys.stderr
    print(f"USAGE: {sys.argv[0]} wyze_email wyze_password thermostat_nickname")
    quit(1)

email=os.sys.argv[1]
password=os.sys.argv[2]

# call auth service to get access token or refresh if needed
getAccessToken(wyzeEmail=email, wyzePassword=password)

clientToken = os.environ.get('WYZE_ACCESS_TOKEN')
if clientToken is None:
    print(f"Token Error!")
    quit(1)

client = Client(token=os.environ['WYZE_ACCESS_TOKEN'])
device_mac = "Not_Set"
thermoNickname = os.sys.argv[3] 

for device in client.devices_list():
    if device.product.model == "CO_EA1" :
        if device.nickname == thermoNickname :
            device_mac = device.mac

if device_mac == "Not_Set":
    sys.stdout = sys.stderr
    print(f"Thermostat not found in list of Wyze devices...")
    quit(1)


try:
    thermostat_ = client.thermostats.info(device_mac=device_mac)
    from wyze_sdk.models.devices import ThermostatSystemMode
    outputDict = {
        "system_mode": str(thermostat_.system_mode),
        "temperature": thermostat_.temperature,
        "cooling_setpoint": thermostat_.cooling_setpoint,
        "heating_setpoint": thermostat_.heating_setpoint,
        "temperature_unit": thermostat_.temperature_unit
    }

    outputJSON = json.dumps(outputDict)
    print(outputJSON)
    quit(0)

except WyzeApiError as e:
    # You will get a WyzeApiError is the request failed
    sys.stdout = sys.stderr
    print(f"Got an error: {e}")
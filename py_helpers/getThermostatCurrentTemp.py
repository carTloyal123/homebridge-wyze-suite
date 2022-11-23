import os
import sys
from wyze_sdk import Client
from wyze_sdk.errors import WyzeApiError

if len(sys.argv) != 4 :
  sys.stdout = sys.stderr
  print(f"USAGE: {sys.argv[0]} wyze_email wyze_password thermostat_nickname")
  quit(1)

device_mac = "Not_Set"

client = Client(email=os.sys.argv[1], password=os.sys.argv[2])
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
  
  print(f"{thermostat_.temperature}")

  quit(0)

except WyzeApiError as e:
    # You will get a WyzeApiError is the request failed
    sys.stdout = sys.stderr
    print(f"Got an error getting current temperature: {e}")
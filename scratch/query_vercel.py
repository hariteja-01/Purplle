import urllib.request
import urllib.error

url = 'https://purplle-inky.vercel.app/health'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print("STATUS:", resp.status)
        print("BODY:", resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP ERROR CODE:", e.code)
    print("HTTP ERROR BODY:", e.read().decode('utf-8'))
except Exception as e:
    print("OTHER ERROR:", str(e))

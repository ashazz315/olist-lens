import urllib.request,urllib.error
url='https://olist-lens-operations.redgoby7.chatgpt.site'
try:
    r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25)
    print({'status':r.status,'url':r.url,'body_start':r.read(400).decode('utf-8',errors='replace')})
except urllib.error.HTTPError as e:
    print({'status':e.code,'server':e.headers.get('server'),'body':e.read(1200).decode('utf-8',errors='replace')})

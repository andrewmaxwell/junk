# Minimal EPT reader: fetch LAZ nodes intersecting a 3857 bbox down to a max depth.
import json, math, urllib.request, io, os, hashlib
import numpy as np, laspy
from concurrent.futures import ThreadPoolExecutor
BASE="https://usgs-lidar-public.s3.amazonaws.com/"
CACHE=os.environ.get('EPT_CACHE') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'cache')
os.makedirs(CACHE,exist_ok=True)
def get(url):
    p=os.path.join(CACHE,hashlib.md5(url.encode()).hexdigest())
    if os.path.exists(p): return open(p,'rb').read()
    for i in range(5):
        try: b=urllib.request.urlopen(url,timeout=120).read(); break
        except Exception:
            if i==4: raise
    open(p+'.tmp','wb').write(b); os.replace(p+'.tmp',p); return b
def merc(lon,lat): return lon*20037508.342789244/180, math.log(math.tan((90+lat)*math.pi/360))*6378137
class EPT:
    def __init__(s,name):
        s.name=name; s.info=json.loads(get(BASE+name+'/ept.json')); s.cube=s.info['bounds']
    def hits(s,key,bbox):
        d,x,y,z=map(int,key.split('-')); c=s.cube; w=(c[3]-c[0])/2**d
        nx0=c[0]+x*w; ny0=c[1]+y*w
        return nx0<bbox[2] and nx0+w>bbox[0] and ny0<bbox[3] and ny0+w>bbox[1]
    def nodes(s,bbox,maxdepth):
        out={}; pages=['0-0-0-0']
        with ThreadPoolExecutor(16) as ex:
            while pages:
                res=list(ex.map(lambda k: json.loads(get(f"{BASE}{s.name}/ept-hierarchy/{k}.json")),pages))
                pages=[]
                for h in res:
                    for k,v in h.items():
                        if int(k.split('-')[0])>maxdepth or not s.hits(k,bbox): continue
                        if v==-1: pages.append(k)
                        elif v>0: out[k]=v
        return out
    def read(s,key):
        las=laspy.read(io.BytesIO(get(f"{BASE}{s.name}/ept-data/{key}.laz")))
        return np.asarray(las.x),np.asarray(las.y),np.asarray(las.z),np.asarray(las.classification)

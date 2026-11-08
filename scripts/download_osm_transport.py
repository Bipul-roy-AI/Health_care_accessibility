"""Acquire a checksum-verified Geofabrik Bangladesh extract; no analysis/download by default.

Raw OSM may contain other tags, but the study extractor imports transport only.
The two official HTTPS endpoints must be reachable; never disable TLS/proxy trust.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]


class HTTPSOnlyRedirect(HTTPRedirectHandler):
    def redirect_request(self,request,response,code,message,headers,newurl):
        if urlsplit(newurl).scheme!='https':raise ValueError('Refusing an HTTPS downgrade during artifact acquisition')
        return super().redirect_request(request,response,code,message,headers,newurl)


def checksum_line(text):
    match=re.fullmatch(r'\s*([0-9a-fA-F]{32})\s+\*?bangladesh-latest\.osm\.pbf\s*',text)
    if not match:raise ValueError('Unexpected Geofabrik checksum response')
    return match.group(1).lower()


def stream_verified(reader,path,expected_md5,max_bytes):
    """Leave existing files intact on failure; atomically publish verified bytes."""
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix=path.name+'.',suffix='.partial')
    md5=hashlib.md5();sha256=hashlib.sha256();total=0
    try:
        with os.fdopen(fd,'wb') as writer:
            while chunk:=reader.read(1024*1024):
                total+=len(chunk)
                if total>max_bytes:raise ValueError('Extract exceeds configured download size limit')
                md5.update(chunk);sha256.update(chunk);writer.write(chunk)
            writer.flush();os.fsync(writer.fileno())
        if not total or md5.hexdigest()!=expected_md5:raise ValueError('Geofabrik checksum mismatch or empty download; artifact not accepted')
        os.replace(tmp,path)
        return {'bytes':total,'md5':md5.hexdigest(),'sha256':sha256.hexdigest()}
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--download',action='store_true')
    p.add_argument('--output',type=Path,default=ROOT/'analysis-inputs/osm/bangladesh-latest.osm.pbf')
    p.add_argument('--max-gib',type=float,default=2.)
    a=p.parse_args()
    source=json.loads((ROOT/'data/accessibility/supporting-sources.json').read_text())['osm']
    if not a.download:
        print(json.dumps(source,ensure_ascii=False,indent=2));print('No download started. Supply --download explicitly for the national extract.');return
    if a.max_gib<=0:p.error('max-gib must be positive')
    if a.output.exists():raise SystemExit('Output exists; keep its provenance and choose another path for a new snapshot')
    headers={'User-Agent':'ShasthoPath-DGHS-BBS-study/1.0'}
    opener=build_opener(HTTPSOnlyRedirect())
    with opener.open(Request(source['checksumUrl'],headers=headers),timeout=30) as response:
        expected=checksum_line(response.read(4096).decode('ascii'))
    with opener.open(Request(source['pbfUrl'],headers=headers),timeout=60) as response:
        if response.headers.get('Content-Length') and int(response.headers['Content-Length'])>a.max_gib*1024**3:raise ValueError('Advertised download exceeds configured size limit')
        result=stream_verified(response,a.output,expected,int(a.max_gib*1024**3))
    metadata={**source,**result,'retrievedAt':datetime.now(timezone.utc).isoformat(),'downloadStatus':'CHECKSUM_VERIFIED',
              'snapshotDate':None,'note':'Retrieval timestamp is not the OSM snapshot timestamp; retain source extract/header metadata separately.'}
    a.output.with_suffix(a.output.suffix+'.provenance.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print('Verified extract:',a.output,'SHA-256:',result['sha256'])


if __name__=='__main__':main()

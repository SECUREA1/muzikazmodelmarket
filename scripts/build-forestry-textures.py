"""Bake deterministic, tileable forestry PBR surfaces; no runtime pixel generation."""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/images/forest-harvest/surfaces'
OUT.mkdir(parents=True,exist_ok=True)
SIZE=2048
rng=np.random.default_rng(54719)
y,x=np.mgrid[0:SIZE,0:SIZE].astype(np.float32)/SIZE

def noise(cx,cy,seed):
    r=np.random.default_rng(seed).random((cy,cx),dtype=np.float32)
    xx=x*cx; yy=y*cy; ix=xx.astype(int); iy=yy.astype(int)
    fx=xx-ix;fy=yy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    return (r[iy%cy,ix%cx]*(1-fx)+r[iy%cy,(ix+1)%cx]*fx)*(1-fy)+(r[(iy+1)%cy,ix%cx]*(1-fx)+r[(iy+1)%cy,(ix+1)%cx]*fx)*fy

def write(kind,shade,height,rough,tint=(1,1,1)):
    shade=np.clip(shade,0,1);height=np.clip(height,0,1)
    rgb=np.stack([np.clip(shade*c,0,1) for c in tint],axis=-1)
    image=Image.fromarray(np.uint8(rgb*255),'RGB')
    image.save(OUT/f'{kind}-albedo.webp',quality=93,method=6)
    image.resize((512,512),Image.Resampling.LANCZOS).save(OUT/f'{kind}-albedo-small.webp',quality=88,method=6)
    h=np.asarray(Image.fromarray(height.astype('float32'),'F').resize((1024,1024),Image.Resampling.BICUBIC))
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))*9;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*9
    z=np.ones_like(dx);length=np.sqrt(dx*dx+dy*dy+1)
    normal=np.stack([(-dx/length+1)/2,(dy/length+1)/2,(z/length+1)/2],axis=-1)
    Image.fromarray(np.uint8(normal*255),'RGB').save(OUT/f'{kind}-normal.webp',lossless=True,method=6)
    Image.fromarray(np.uint8(np.clip(rough,0,1)*255),'L').resize((512,512),Image.Resampling.LANCZOS).save(OUT/f'{kind}-roughness.webp',quality=92,method=6)
    print(kind,flush=True)

b=noise(8,8,11);m=noise(38,36,13);f=noise(300,320,17)
for kind in ['bark','wood','endgrain','soil','gravel','metal','rubber']:
    if kind=='bark':
        warp=noise(8,6,31)*.095+noise(24,14,32)*.022
        ridges=(np.sin((x+warp)*math.tau*31)*.5+.5)**.48
        fissure=np.clip((noise(80,7,41)-.62)*6,0,1)*.21
        h=.26+ridges*.5+m*.13-fissure
        shade=.42+.38*ridges+.12*m+.06*f-fissure*.9
        write(kind,shade,h,.78+.19*f,(1,.975,.94))
    elif kind=='wood':
        wave=x+.018*np.sin(y*math.tau*3)+noise(5,14,45)*.016
        grain=np.sin(wave*math.tau*45+noise(20,8,46)*2)*.5+.5
        fibre=noise(420,18,47)
        knot=np.exp(-(((x-.42)/.08)**2+((y-.51)/.22)**2))
        rings=np.sin(np.sqrt(((x-.42)*4)**2+((y-.51)*1.4)**2)*170)*.5+.5
        shade=.74+grain*.14+fibre*.08-knot*(.2+.15*rings)
        write(kind,shade,.42+grain*.07+fibre*.05+knot*rings*.035,.68+fibre*.19,(1,.98,.94))
    elif kind=='endgrain':
        r=np.sqrt((x-.5)**2+(y-.5)**2);angle=np.arctan2(y-.5,x-.5)
        ring=np.sin((r+noise(7,7,49)*.008)*math.tau*56)*.5+.5
        crack=(np.sin(angle*13+noise(5,5,50))>.999).astype(np.float32)*np.clip((r-.18)*2,0,.32)
        write(kind,.76+.16*ring+.05*f-crack,.4+ring*.1-crack,.8+.13*f,(1,.97,.91))
    elif kind=='soil':
        clods=np.clip((m-.25)*1.4,0,1);fine=noise(760,760,51)
        needles=(np.sin(x*math.tau*190+y*math.tau*134)>.98).astype(np.float32)*np.clip((f-.5)*3,0,1)
        h=.22+clods*.37+fine*.13+needles*.08
        write(kind,.52+b*.17+clods*.2+fine*.06+needles*.12,h,.89+fine*.1,(1,.98,.94))
    elif kind=='gravel':
        # Multiple cellular scales yield stones rather than a uniform noise carpet.
        cells=68;cx=x*cells;cy=y*cells;ix=cx.astype(int);iy=cy.astype(int)
        points=np.random.default_rng(61).random((cells,cells,2),dtype=np.float32)
        nearest=np.full(x.shape,9,dtype=np.float32);second=nearest.copy();stone=np.zeros_like(x)
        for oy in [-1,0,1]:
            for ox in [-1,0,1]:
                px=points[(iy+oy)%cells,(ix+ox)%cells,0]+ix+ox
                py=points[(iy+oy)%cells,(ix+ox)%cells,1]+iy+oy
                dist=(cx-px)**2+(cy-py)**2
                use=dist<nearest;second=np.minimum(second,np.where(use,nearest,dist))
                stone=np.where(use,points[(iy+oy)%cells,(ix+ox)%cells,0],stone);nearest=np.minimum(nearest,dist)
        edge=np.clip((second-nearest)*14,0,1);h=.18+edge*.37+m*.1+f*.06
        write(kind,.44+edge*(.2+stone*.22)+f*.08,h,.82+.16*f,(.985,1,1.015))
    elif kind=='metal':
        brush=noise(7,950,71);pits=np.clip((f-.8)*5,0,1)
        write(kind,.84+brush*.085+m*.045-pits*.09,.48+brush*.025+pits*.018,.48+brush*.29,(.985,1,1.02))
    elif kind=='rubber':
        stipple=noise(680,680,81);rib=(np.sin(x*math.tau*70)*.5+.5)
        write(kind,.76+stipple*.11+rib*.05,.4+stipple*.1+rib*.05,.86+stipple*.13)

# Alpha-cut foliage sprays produce real gaps between individual leaf silhouettes.
for kind in ['foliage','pineFoliage']:
    n=1024;im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im);r=np.random.default_rng(983 if kind=='foliage' else 984)
    d.line([(512,995),(512,95)],fill=(117,112,72,255),width=11)
    for side in [-1,1]:
        for row in range(8):
            sy=880-row*93;ex=512+side*(290-row*19);ey=sy-140
            d.line([(512,sy),(ex,ey)],fill=(133,130,91,255),width=6)
            for j in range(9 if kind=='pineFoliage' else 5):
                t=(j+1)/(10 if kind=='pineFoliage' else 6);px=512+(ex-512)*t;py=sy+(ey-sy)*t
                for s in [-1,1]:
                    if kind=='pineFoliage':
                        tip=(px+side*(38+float(r.random())*30),py+s*(52+float(r.random())*35))
                        d.line([(px,py),tip],fill=(int(r.integers(123,181)),int(r.integers(165,221)),int(r.integers(91,143)),255),width=int(r.integers(4,7)))
                    else:
                        lx=px+side*float(r.integers(19,40));ly=py+s*float(r.integers(36,59));w=float(r.integers(30,48));h=float(r.integers(50,76))
                        color=(int(r.integers(150,204)),int(r.integers(188,236)),int(r.integers(111,162)),255)
                        d.polygon([(lx,ly-h),(lx+w,ly-h*.25),(lx+w*.6,ly+h*.55),(lx,ly+h),(lx-w*.6,ly+h*.55),(lx-w,ly-h*.25)],fill=color)
                        d.line([(lx,ly-h),(lx,ly+h)],fill=(204,221,150,255),width=3)
                        for v in [-.45,0,.45]:d.line([(lx,ly+v*h),(lx+w*.7,ly+(v-.25)*h)],fill=(166,193,116,255),width=2)
    im.save(OUT/f'{kind}-albedo.webp',lossless=True,method=6)
    im.resize((512,512),Image.Resampling.LANCZOS).save(OUT/f'{kind}-albedo-small.webp',lossless=True,method=6)
    print(kind,flush=True)

manifest={'version':'forestry-realism-v2','albedoResolution':2048,'normalResolution':1024,'roughnessResolution':512,'foliageResolution':1024,'mobileAlbedoResolution':512,'surfaces':['bark','wood','endgrain','soil','gravel','metal','rubber','foliage','pineFoliage']}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

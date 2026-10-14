import json, pathlib, xml.etree.ElementTree as ET
root=pathlib.Path(__file__).resolve().parents[1]
data=json.loads((root/'docs/penpot-design.json').read_text(encoding='utf-8'))
svg=ET.fromstring((root/'public/design/penpot-dashboard.svg').read_text(encoding='utf-8'))
ns='http://www.w3.org/2000/svg'
ET.register_namespace('',ns)
icons={'latest':['f7524590-3477-8060-8008-bcfaa9b7ca73'],'profit':['f7524590-3477-8060-8008-bcfaa9ced366'],'drawdown':['f7524590-3477-8060-8008-bcfaa9f60434'],'monthly':['f7524590-3477-8060-8008-bcfaaa1efaac'],'edit':['f7524590-3477-8060-8008-bcfaaa33fa99'],'sharpe':['aec514b5-80cd-8063-8008-bcfbc1169b78'],'home':['e884fc00-26ff-5f90-a366-f92964a73330','3a9eb70f-d7db-52f9-a2aa-63df6d35b62d'],'backtests':['26448b50-81b2-570e-a5e9-deed72ea72e9'],'strategies':['1dfeead7-bfff-5956-af39-8694b3563af3'],'data':['b715e0e3-0f26-5894-9805-b73e7ef27f61','cb8117c3-aea1-5b9e-9a4d-db466871205e'],'settings':['4104a197-0330-5b40-a014-399072f48e07','c852e83d-dd20-542c-9444-595cfa0f658b'],'help':['00570293-9046-5ffb-8534-c64b9ed664c7','02ed487e-e482-5e9b-9a39-02633839795a']}
icons.update({'assistant':['bc4bbe53-21d9-51ad-9995-100d1d09135f'],'chart':['f7524590-3477-8060-8008-bcfaaa09b4e5'],'layers':['07dd4b82-aadd-573e-9aec-beb945755b5e']})
for name,ids in icons.items():
    shapes=[next(s for s in data if s['id']==i) for i in ids]
    x=min(s['x'] for s in shapes)-8194-1;y=min(s['y'] for s in shapes)-9600-1
    w=max(s['x']+s['w'] for s in shapes)-8194-x+1;h=max(s['y']+s['h'] for s in shapes)-9600-y+1
    image=ET.Element('{'+ns+'}svg',{'fill':'none','viewBox':f'{x} {y} {w} {h}','width':str(w),'height':str(h)})
    for i in ids:
        element=next((e for e in svg.iter() if e.get('id')=='shape-'+i),None)
        if element is not None:image.append(element)
    (root/f'public/design/icon-{name}.svg').write_text(ET.tostring(image,encoding='unicode'),encoding='utf-8')

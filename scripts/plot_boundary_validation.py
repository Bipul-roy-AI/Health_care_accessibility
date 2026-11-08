"""Reproduce the supplied district/ADM3 diagnostic figure, not a coverage map."""
import argparse
from pathlib import Path
import geopandas as gpd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def date_label(frame,field):
    if field not in frame:return 'not reported'
    values=sorted(set(frame[field].dropna().astype(str)))
    return values[0][:10] if len(values)==1 else 'multiple dates'


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--district',required=True,type=Path);p.add_argument('--adm3',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();district=gpd.read_file(a.district);adm3=gpd.read_file(a.adm3)
    if 'ADM2_PCODE' not in district or 'ADM3_PCODE' in district or 'ADM3_PCODE' not in adm3 or 'ADM4_PCODE' in adm3:raise ValueError('Expected district ADM2 and upazila/thana ADM3 layers')
    fig,axes=plt.subplots(1,2,figsize=(11,8.5))
    for ax,frame,title,color in [(axes[0],district,f'{len(district)} districts · ADM2','#164f66'),(axes[1],adm3,f'{len(adm3)} upazila/thana areas · ADM3','#27634d')]:
        frame.to_crs(4326).plot(ax=ax,facecolor='#f5f7f4',edgecolor=color,linewidth=.35)
        ax.set_title(title,fontsize=13);ax.set_xlabel('Longitude (WGS84)');ax.set_ylabel('Latitude (WGS84)')
        ax.set_xlim(87.8,92.9);ax.set_ylim(20.4,26.9)
    fig.suptitle('Supplied Bangladesh boundary layers: level validation',fontsize=15)
    source_date=date_label(district,'date');valid_on=date_label(district,'validOn')
    fig.text(.5,.018,f'BBS / supplied OCHA-HDX metadata · geometry date {source_date}; validOn {valid_on}\nThe file named Bd_union.zip contains ADM3, not union boundaries. No population coverage is shown.',ha='center',fontsize=8.5)
    fig.tight_layout(rect=[0,.105,1,.95])
    a.output.parent.mkdir(parents=True,exist_ok=True)
    fig.savefig(a.output,dpi=180,bbox_inches='tight');plt.close(fig)


if __name__=='__main__':main()

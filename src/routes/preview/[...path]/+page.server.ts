import {readPreviewPath} from '@commitpress/sdk/preview';
import {error, isHttpError} from '@sveltejs/kit';
import {loadShowcase} from '$lib/content/showcase.server';
import {readPreviewRoute} from '$lib/content/locale';
import type {PageServerLoad} from './$types';
export const load:PageServerLoad=async({params,url})=>{
  const route=readPreviewRoute(params.path ?? '',url.searchParams.get('locale'));
  const target=readPreviewPath(route.path);
  const global=target.kind === 'globals';
  const collection=target.kind === 'collections';
  if(global && target.path !== 'site') throw error(404,'Global not found');
  try {
    const contentPath=collection ? 'content/collections/'+target.path : undefined;
    const data=await loadShowcase(global ? '' : target.path,route.locale,true,contentPath);
    return {...data,global};
  }catch(cause){
    const missing=isHttpError(cause,404)||(cause as {code?:string})?.code==='ENOENT';
    if(!missing||global)throw cause;
    const data=await loadShowcase('',route.locale,true);
    return {...data,page:null,entry:null,kind:collection ? 'entry' as const : 'page' as const,global:false};
  }
};

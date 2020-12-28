#!/bin/bash

while getopts s:e: flag
do
    case "${flag}" in
        s) start=${OPTARG};;
        e) end=${OPTARG};;
    esac
done

i=$start

while [ $i -le $end ]
do
  echo Number: $i
  (($(curl --silent -I https://c226212.ssl.cf0.rackcdn.com/${i}.jpg \
    | grep -E "^HTTP" \
    | awk -F " " '{print $2}') == 200)) \
    && curl https://c226212.ssl.cf0.rackcdn.com/${i}.jpg --output ${i}.jpg
  let "i+=1" 
done

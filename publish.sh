rm ./Archieve.zip
zip -r Archieve.zip .
aws lambda update-function-code --function-name bookit --zip-file fileb://./Archieve.zip --publish

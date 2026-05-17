#!/bin/bash
export PATH=/root/bin:$PATH

PROJECT_DIR="/root/lms-docker"
LOCAL_BACKUP_DIR="$PROJECT_DIR/backup/dump"
LOG_FILE="$PROJECT_DIR/log/db_backup.log"
TIMESTAMP=$(date +%Y-%m-%d)

# create if not exist
mkdir -p $LOCAL_BACKUP_DIR
mkdir -p $PROJECT_DIR/log
touch $LOG_FILE

FINAL_FILE="$LOCAL_BACKUP_DIR/$TIMESTAMP.dump.br"

pg_dump -Fc lms | brotli --best > "$FINAL_FILE"

if [ $? -ne 0 ]; then
    echo "$(date): dump FAILED." >> $LOG_FILE
    exit 1
fi

find $LOCAL_BACKUP_DIR -type f -mtime +30 -name "*.br" -delete

aws --profile backblaze-b2 s3 cp "$FINAL_FILE" "s3://rua-backup/lms/dump/$TIMESTAMP.sql.br"

if [ $? -ne 0 ]; then
    echo "$(date): upload FAILED." >> $LOG_FILE
    exit 1
fi

# now we sync the upload folder
aws --profile backblaze-b2 s3 sync $PROJECT_DIR/storage/uploads s3://rua-backup/lms/uploads

if [ $? -ne 0 ]; then
    echo "$(date): sync FAILED." >> $LOG_FILE
    exit 1
fi

curl -fsS --retry 3 https://hc-ping.com/cqasv55yxlwxoretrhbg8w/rua-backup
#!/bin/bash

# Dinleme yapacağınız port aralığını belirtin
START_PORT=5201
END_PORT=5205

# Port listesini üret
PORT_LIST=$(seq $START_PORT $END_PORT)

# Her port için bir iperf3 sunucusu başlat
for PORT in $PORT_LIST; do
    echo "Port $PORT üzerinde dinleme yapılıyor..."
    iperf3 -s -p $PORT &
done

# Sunucuların arka planda çalışmasını sağla
wait

#!/bin/bash

# Dosya yolları
output_file="route_check_results.txt"
namespace_prefix="vpnns"
max_ns=$1 # Max namespace number (e.g., 100 for vpnns0 to vpnns100)

# Sonuçları dosyaya yaz
echo "Namespace Route Check Results" > "$output_file"
echo "=============================" >> "$output_file"

# Namespace'leri kontrol et
for i in $(seq 0 $max_ns); do
    ns_name="${namespace_prefix}${i}"
    
    # Varsayılan rota var mı kontrol et
    default_route=$(ip netns exec "$ns_name" ip route show | grep "^default")
    
    if [ -n "$default_route" ]; then
        echo "$ns_name: Default route exists." >> "$output_file"
    else
        echo "$ns_name: Default route missing!" >> "$output_file"
    fi
done

echo "Route check completed. Results saved to $output_file."

import React, { useState, useEffect, useRef } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';

// UPDATE TO YOUR LAPTOP'S IP ADDRESS
const API_URL = "https://ppl-warehouse-wkdp.onrender.com";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  
  // Authentication & Splash States
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // App States
  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { setShowSplash(false); }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // --- 1. LOGIN FUNCTION (FIXED MEMORY) ---
  const handleLogin = async () => {
    if (!username || !password) return Alert.alert("Error", "Please enter credentials");
    try {
      const res = await axios.post(`${API_URL}/app-login`, {
        username: username.toLowerCase().trim(),
        password: password.trim()
      });
      if (res.data.success) {
        setIsAuthenticated(true);
        // We only clear the password now! We KEEP the username so we know who is scanning.
        setPassword(''); 
      }
    } catch (err) {
      Alert.alert("Access Denied ❌", "Incorrect username or password.");
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{marginBottom: 20}}>Camera permission required.</Text>
        <TouchableOpacity style={styles.btnGreen} onPress={requestPermission}><Text style={styles.btnText}>Enable Camera</Text></TouchableOpacity>
      </View>
    );
  }

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashLogo}>PPL</Text>
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20, transform: [{ scale: 1.5 }] }} />
        <Text style={styles.splashText}>LOADING SYSTEM...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Warehouse App</Text>
          <Text style={styles.loginSubtitle}>Authorized Personnel Only</Text>
          <TextInput style={styles.loginInput} placeholder="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry={true} />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}><Text style={styles.btnText}>Login Securely</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSearch = async (searchCode) => {
    if (!searchCode) return Alert.alert("Error", "Please enter a code");
    setScanned(true); 
    try {
      const res = await axios.get(`${API_URL}/product/${searchCode.trim()}`);
      setProduct(res.data);
      setManualCode(''); 
    } catch (err) {
      Alert.alert("Not Found", `Code ${searchCode} is not in the system.`, [{ text: "OK", onPress: () => setScanned(false) }]);
    }
  };

  // --- 2. UPDATE FUNCTION (NOW SENDS USERNAME) ---
  const handleUpdate = async (type) => {
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) return Alert.alert("Error", "Enter a valid quantity");
    try {
      const res = await axios.post(`${API_URL}/stock`, {
        barcode: product.barcode || product.productCode, 
        type: type, 
        quantity: parseInt(quantity),
        username: username // <--- Sends the saved username to the server!
      });
      Alert.alert("Success! ✅", `${type} recorded.\nNew Stock: ${res.data.newStock}`, [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) { Alert.alert("Failed", "Server Error."); }
  };

  const resetApp = () => { setScanned(false); setProduct(null); setQuantity('1'); };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername(''); // Clear username when they actually log out
  }

  return (
    <SafeAreaView style={styles.container}>
      {!scanned ? (
        <View style={{flex: 1}}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Inventory Tools</Text>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={{color: 'white', fontWeight: 'bold'}}>Logout</Text></TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} placeholder="Type code..." value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" />
            <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch(manualCode)}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
          </View>

          <View style={styles.cameraContainer}>
             <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={({data}) => handleSearch(data)} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.detailsBox}>
          {product && (
            <View style={{width: '100%'}}>
              <Text style={styles.itemTitle}>{String(product.productCode || 'N/A')}</Text>
              <View style={styles.card}>
                <View style={styles.infoRow}><Text style={styles.label}>Sector:</Text><Text style={styles.val}>{String(product.sector || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Type:</Text><Text style={styles.val}>{String(product.type || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Grade:</Text><Text style={styles.val}>{String(product.grade || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>A/F:</Text><Text style={styles.val}>{String(product.af !== undefined && product.af !== null ? product.af : '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Length:</Text><Text style={styles.val}>{String(product.length || 0)} mm</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Wt/Pc:</Text><Text style={styles.val}>{String(product.weightPerPc || 0)} g</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Stock:</Text><Text style={[styles.val, {color: '#007bff', fontSize: 18}]}>{String(product.currentStock || 0)}</Text></View>
              </View>

              <Text style={styles.qtyLabel}>Movement Quantity:</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} autoFocus={true} />

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnGreen} onPress={() => handleUpdate('INWARD')}><Text style={styles.btnText}>+ INWARD</Text></TouchableOpacity>
                <TouchableOpacity style={styles.btnRed} onPress={() => handleUpdate('DISPATCH')}><Text style={styles.btnText}>- DISPATCH</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetApp}><Text style={styles.cancelText}>Cancel & Rescan</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  splashContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  splashLogo: { fontSize: 80, fontWeight: '900', color: '#007bff', letterSpacing: 5 },
  splashText: { marginTop: 40, color: '#666', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  loginContainer: { flex: 1, backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center' },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 15, width: '85%', alignItems: 'center', elevation: 5 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#007bff', marginBottom: 5 },
  loginSubtitle: { fontSize: 14, color: '#666', marginBottom: 25 },
  loginInput: { width: '100%', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  loginBtn: { backgroundColor: '#007bff', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  header: { padding: 30, backgroundColor: '#007bff', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  headerText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  logoutBtn: { position: 'absolute', right: 20, top: 35 },
  searchContainer: { flexDirection: 'row', padding: 15, backgroundColor: 'white', elevation: 2, zIndex: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  searchBtn: { backgroundColor: '#333', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8, marginLeft: 10 },
  searchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cameraContainer: { flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', backgroundColor: 'black' },
  detailsBox: { padding: 20, alignItems: 'center' },
  itemTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 15 },
  card: { backgroundColor: 'white', width: '100%', padding: 15, borderRadius: 10, elevation: 3, marginBottom: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8 },
  label: { color: '#666', fontWeight: 'bold' },
  val: { fontWeight: 'bold', color: '#333' },
  qtyLabel: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  input: { borderBottomWidth: 3, borderColor: '#007bff', width: 120, fontSize: 36, textAlign: 'center', marginBottom: 20 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnGreen: { flex: 1, backgroundColor: '#28a745', padding: 18, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  btnRed: { flex: 1, backgroundColor: '#dc3545', padding: 18, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { marginTop: 30 },
  cancelText: { color: '#007bff', fontSize: 16, fontWeight: 'bold' }
});